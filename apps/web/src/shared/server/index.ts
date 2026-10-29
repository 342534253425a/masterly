/** Только для серверных компонентов (RSC): транспорт без лишнего HTTP-хопа, проверка доступа, город из cookie. */
export { getServerCity, getServerQueryClient, requireUser, serverApiCall } from './api';
