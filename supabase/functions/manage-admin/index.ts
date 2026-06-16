// Supabase Edge Function: manage-admin
// Purpose: securely create and activate/deactivate Admin Absensi accounts from the web app.
// Deploy: pnpm exec supabase functions deploy manage-admin --no-verify-jwt
// Note: This function uses Supabase service-role credentials that are available only inside Edge Functions.
// Never expose service-role / secret keys in Vite, browser, Android, or any client-side code.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type JsonRecord = Record<string, unknown>;
type AdminAction = 'create' | 'activate' | 'deactivate';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message || 'Gagal memproses admin.',
      name: error.name,
      stack: error.stack
    };
  }

  if (error && typeof error === 'object') {
    const record = error as JsonRecord;
    const message =
      String(record.message || record.error_description || record.error || record.details || '').trim() ||
      'Gagal memproses admin.';

    return {
      message,
      code: record.code,
      details: record.details,
      hint: record.hint,
      status: record.status,
      name: record.name
    };
  }

  return { message: typeof error === 'string' && error.trim() ? error.trim() : 'Gagal memproses admin.' };
}

function publicErrorMessage(error: unknown) {
  const detail = describeError(error);
  const extras = [detail.details, detail.hint].filter(Boolean).map(String);
  return extras.length ? `${detail.message} | ${extras.join(' | ')}` : detail.message;
}

function log(message: string, extra?: JsonRecord) {
  // Diagnostic logs are intentionally free of passwords / service keys.
  console.log(`[manage-admin] ${message}`, extra || {});
}

function failStep(step: string, error: unknown): never {
  const detail = describeError(error);
  console.error(`[manage-admin] ${step} failed`, detail);
  throw new Error(`${step}: ${publicErrorMessage(error)}`);
}

function readBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Token login tidak ditemukan. Silakan login ulang.');
  return token;
}

function requiredString(value: unknown, label: string) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} wajib dikirim.`);
  return text;
}

function readServiceKey() {
  // SUPABASE_SERVICE_ROLE_KEY is normally injected by Supabase Edge Functions.
  // SECRET_KEY names are accepted as fallback for projects using the newer secret-key format.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY');

  if (!serviceKey) {
    throw new Error('Service-role key tidak tersedia di Edge Function. Deploy function ke Supabase project yang benar. Jangan pakai publishable key untuk admin.');
  }
  return serviceKey;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  // Supabase Admin API has no reliable direct email lookup in all versions.
  // We scan pages safely so create-admin can recover when the email already exists.
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) failStep('List auth users', error);
    const found = data.users.find((user) => (user.email || '').toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}

async function resolveOwnerOrganization(admin: ReturnType<typeof createClient>, callerId: string, requestedOrganizationId: string) {
  // FIX: Ambil membership Owner dari server, bukan percaya penuh pada organizationId dari client.
  // Ini juga menghindari gagal ketika frontend masih mengirim template organizationId lama.
  const { data, error } = await admin
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', callerId);

  if (error) failStep('Cek role Owner di organization_users', error);

  const memberships = Array.isArray(data) ? data : [];
  const requestedOwner = memberships.find((row) => row.organization_id === requestedOrganizationId && row.role === 'owner');
  const firstOwner = memberships.find((row) => row.role === 'owner');
  const selected = requestedOwner || firstOwner;

  if (!selected) {
    log('owner membership not found', { callerId, requestedOrganizationId, membershipsCount: memberships.length });
    throw new Error('Hanya Owner dapat mengelola admin. Pastikan akun Owner sudah ada di tabel organization_users dengan role owner.');
  }

  if (selected.organization_id !== requestedOrganizationId) {
    log('organization id adjusted from owner membership', {
      requestedOrganizationId,
      resolvedOrganizationId: String(selected.organization_id)
    });
  }

  return String(selected.organization_id);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method tidak didukung.' }, 405);

  try {
    log('request received', { method: req.method });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = readServiceKey();
    if (!supabaseUrl) throw new Error('SUPABASE_URL tidak tersedia di Edge Function.');

    const token = readBearerToken(req);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify caller using the browser JWT, then authorize by organization role.
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError) failStep('Validasi sesi Owner', userError);
    if (!userData.user) throw new Error('Sesi Owner tidak valid. Silakan login ulang.');

    const body = await req.json().catch(() => ({} as JsonRecord));
    const action = String(body.action || '').trim() as AdminAction;
    const requestedOrganizationId = requiredString(body.organizationId, 'organizationId');
    log('action parsed', { action, requestedOrganizationId, callerId: userData.user.id });

    const organizationId = await resolveOwnerOrganization(admin, userData.user.id, requestedOrganizationId);
    log('owner authorized', { organizationId, callerId: userData.user.id });

    if (action === 'create') {
      const fullName = requiredString(body.fullName, 'Nama admin');
      const email = requiredString(body.email, 'Email admin').toLowerCase();
      const password = String(body.password || '');
      if (!email.includes('@')) throw new Error('Email admin tidak valid.');
      if (password.length < 6) throw new Error('Password awal minimal 6 karakter.');

      log('create admin started', { email, organizationId });

      let authUser = await findAuthUserByEmail(admin, email);
      let createdNewUser = false;

      if (!authUser) {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'admin_operasional' }
        });

        // If the email was created in another request at the same time, recover by looking it up.
        if (createError) {
          const duplicate = /already|registered|exists|duplicate/i.test(createError.message || '');
          if (!duplicate) failStep('Buat auth user admin', createError);
          authUser = await findAuthUserByEmail(admin, email);
          if (!authUser) failStep('Cari auth user admin yang sudah ada', createError);
        } else {
          if (!created.user) throw new Error('Auth user gagal dibuat.');
          authUser = created.user;
          createdNewUser = true;
        }
      } else {
        // Existing email: turn it into an active Admin Absensi for this organization.
        // Password is updated because Owner supplied a new initial password from the modal.
        const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUser.id, {
          password,
          user_metadata: { ...(authUser.user_metadata || {}), full_name: fullName, role: 'admin_operasional' }
        });
        if (updateAuthError) failStep('Update auth user admin', updateAuthError);
      }

      const userId = authUser.id;
      if (userId === userData.user.id) throw new Error('Owner tidak dapat dijadikan Admin Absensi pada akun yang sama.');

      const { data: existingMembership, error: existingMembershipError } = await admin
        .from('organization_users')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();
      if (existingMembershipError) failStep('Cek membership admin existing', existingMembershipError);
      if (existingMembership?.role === 'owner') throw new Error('Email ini sudah terdaftar sebagai Owner. Gunakan email admin yang berbeda.');

      const { error: profileError } = await admin
        .from('profiles')
        .upsert({ id: userId, full_name: fullName, is_active: true }, { onConflict: 'id' });
      if (profileError) failStep('Simpan profil admin', profileError);

      const { error: orgError } = await admin
        .from('organization_users')
        .upsert({
          organization_id: organizationId,
          user_id: userId,
          role: 'admin_operasional',
          created_by: userData.user.id
        }, { onConflict: 'organization_id,user_id' });
      if (orgError) failStep('Simpan role Admin Absensi', orgError);

      log('admin create success', { userId, createdNewUser, organizationId });
      return json({ ok: true, userId, createdNewUser });
    }

    if (action === 'activate' || action === 'deactivate') {
      const userId = requiredString(body.userId, 'userId');
      if (userId === userData.user.id) throw new Error('Owner tidak dapat menonaktifkan akun sendiri.');

      const active = action === 'activate';
      const { error: profileError } = await admin.from('profiles').update({ is_active: active }).eq('id', userId);
      if (profileError) failStep('Ubah status profil admin', profileError);

      log('admin status changed', { userId, active, organizationId });
      return json({ ok: true });
    }

    throw new Error('Action manage-admin tidak dikenal.');
  } catch (error) {
    const message = publicErrorMessage(error);
    console.error('[manage-admin] failed', describeError(error));
    // Return 200 with ok:false so the frontend can display the exact server error cleanly.
    return json({ ok: false, error: message });
  }
});
