import { calculatorExtension } from '@/lib/views-api/calculator-extensions';
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  return calculatorExtension('profit-estimator', request);
}
