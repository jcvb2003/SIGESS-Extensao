const globalRef = globalThis as any;

if (
  typeof globalRef.browser === "undefined" &&
  typeof globalRef.chrome !== "undefined"
) {
  globalRef.browser = globalRef.chrome;
}

