import { executeExample } from './playground-runtime';
// Each run gets a fresh worker. The parent gives the code three seconds from when this module has loaded,
// so loading the packages and fonts on a slow device does not count against it.
self.postMessage({ ready: true });
self.onmessage = (event: MessageEvent<{ code: string }>) => {
  try {
    self.postMessage({ ok: true, output: executeExample(event.data.code) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
