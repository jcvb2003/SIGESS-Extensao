export const getFingerprint = async (): Promise<string> => {
  return await getPersistentId();
};
const getPersistentId = async (): Promise<string> => {
  const storage = await browser.storage.local.get("fp_id");
  if (storage.fp_id) return storage.fp_id;
  const newId = crypto.randomUUID();
  await browser.storage.local.set({ fp_id: newId });
  return newId;
};
