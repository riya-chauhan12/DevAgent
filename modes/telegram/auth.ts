export const isOwner = (id?: number) =>
  id !== undefined && String(id) === process.env.TELEGRAM_OWNER_ID?.trim();