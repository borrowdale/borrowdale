import { executeExample } from './playground-runtime';
// Each run gets a fresh worker. The parent terminates it after three seconds.
self.onmessage = (event: MessageEvent<{ code: string }>) => {
  try { self.postMessage({ ok: true, output: executeExample(event.data.code) }); }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
