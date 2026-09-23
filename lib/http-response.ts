import 'server-only';

import { NextResponse } from 'next/server';

export function redirectToLocalPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Redirect targets must be local application paths.');
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}
