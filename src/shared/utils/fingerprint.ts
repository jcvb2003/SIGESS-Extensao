export const getFingerprint = async (): Promise<string> => {
  const fpData = {
    platform: await browser.runtime.getPlatformInfo(),
    language: navigator.language,
    hardware: navigator.hardwareConcurrency,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    storageId: await getPersistentId(),
  };
  const msgUint8 = new TextEncoder().encode(JSON.stringify(fpData));
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
const getPersistentId = async (): Promise<string> => {
  const storage = await browser.storage.local.get("fp_id");
  if (storage.fp_id) return storage.fp_id;
  const newId = crypto.randomUUID();
  await browser.storage.local.set({ fp_id: newId });
  return newId;
};
