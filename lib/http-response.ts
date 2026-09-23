import 'server-only';

import { NextResponse } from 'next/server';

import { getPublicOrigin } from '@/lib/request-security';

export function redirectToLocalPath(request: Request, path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Redirect targets must be local application paths.');
  }

  return NextResponse.redirect(new URL(path, getPublicOrigin(request)), 303);
}
