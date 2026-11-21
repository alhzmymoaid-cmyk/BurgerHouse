import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseCustomerServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function customer() {
  const supabase = createSupabaseCustomerServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !(user.app_metadata?.customer_account === true || Boolean(user.phone) || String(user.email || '').endsWith('@login.burgerhouse.invalid'))) return null;
  return { supabase, user };
}

export async function GET() {
  const session = await customer();
  if (!session) return NextResponse.json({ error: 'CUSTOMER_AUTH_REQUIRED' }, { status: 401 });
  const { data, error } = await session.supabase.from('customer_favorites').select('product_id, created_at').eq('customer_id', session.user.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'FAVORITES_LOAD_FAILED' }, { status: 500 });
  return NextResponse.json({ favorites: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const session = await customer();
  if (!session) return NextResponse.json({ error: 'CUSTOMER_AUTH_REQUIRED' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  if (!productId || productId.length > 100) return NextResponse.json({ error: 'INVALID_PRODUCT' }, { status: 400 });
  const { data: product, error: productError } = await session.supabase.from('products').select('id').eq('id', productId).eq('is_active', true).maybeSingle();
  if (productError || !product) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
  const { error } = await session.supabase.from('customer_favorites').upsert({ customer_id: session.user.id, product_id: productId }, { onConflict: 'customer_id,product_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'FAVORITE_SAVE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const session = await customer();
  if (!session) return NextResponse.json({ error: 'CUSTOMER_AUTH_REQUIRED' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  if (!productId || productId.length > 100) return NextResponse.json({ error: 'INVALID_PRODUCT' }, { status: 400 });
  const { error } = await session.supabase.from('customer_favorites').delete().eq('customer_id', session.user.id).eq('product_id', productId);
  if (error) return NextResponse.json({ error: 'FAVORITE_REMOVE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}