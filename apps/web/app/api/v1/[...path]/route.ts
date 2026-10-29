/**
 * Демо-режим (API_MODE=mock): контрактный мок-бэкенд на тех же MSW-хендлерах, что в Storybook и тестах.
 * В режиме live запросы /api/v1/* переписываются на API Gateway в next.config.ts и сюда не попадают.
 */
const handle = async (request: Request): Promise<Response> => {
  if ((process.env.API_MODE ?? 'mock') !== 'mock') {
    return Response.json({ title: 'Mock API disabled', status: 404 }, { status: 404 });
  }
  const { handleMockRequest } = await import('@masterly/mock-api');
  return handleMockRequest(request);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

export const dynamic = 'force-dynamic';
