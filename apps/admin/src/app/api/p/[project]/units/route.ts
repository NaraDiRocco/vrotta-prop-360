import { NextResponse, type NextRequest } from 'next/server';
import { UNIT_STATUSES, type UnitStatus } from '@r360/core';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { UnitsResponse } from '@/lib/units/api-types.ts';
import { emptyCounts, queryUnits } from '@/lib/units/query.ts';
import { parseTableState, toQueryParams } from '@/lib/units/url-state.ts';

/**
 * Una página de unidades. El filtrado y el paginado pasan siempre acá: el
 * navegador nunca recibe las 640 filas de un loteo, recibe 100.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const all = await getRepo().getAllUnits(project);
  const params = toQueryParams(parseTableState(request.nextUrl.searchParams));
  const page = queryUnits(all, params);

  const groupCounts: UnitsResponse['groupCounts'] = {};
  for (const unit of all) {
    const key = unit.groupId ?? '';
    const entry = groupCounts[key] ?? { total: 0, counts: emptyCounts() };
    entry.total += 1;
    entry.counts[unit.status] += 1;
    groupCounts[key] = entry;
  }

  const body: UnitsResponse = { ...page, groupCounts };
  return NextResponse.json(body);
}

export function statusOrEmpty(value: string): UnitStatus | null {
  return (UNIT_STATUSES as readonly string[]).includes(value) ? (value as UnitStatus) : null;
}
