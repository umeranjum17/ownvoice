import type { InferModel, InferModelStore } from '@byokit/infer';
import * as FS from '@dr.pogodin/react-native-fs';

/**
 * File system store for @byokit/infer using react-native-fs.
 * Models are stored in the app's document directory.
 */
export function createLocalStore(): InferModelStore {
  const dir = `${FS.DocumentDirectoryPath}/models`;

  return {
    path(m: InferModel): string {
      return `${dir}/${m.file}`;
    },

    async size(m: InferModel): Promise<number | undefined> {
      try {
        const stat = await FS.stat(this.path(m));
        return stat.size;
      } catch {
        return undefined;
      }
    },

    async download(m: InferModel, o: {
      signal?: AbortSignal;
      onProgress?: (received: number, total: number) => void;
      resume: true;
    }): Promise<void> {
      await FS.mkdir(dir, { NSURLIsExcludedFromBackupKey: true }).catch(() => {});
      const path = this.path(m);

      const job = FS.downloadFile({
        fromUrl: m.url,
        toFile: path,
        progressInterval: 500,
        begin: (res) => {
          o.onProgress?.(0, res.contentLength);
        },
        progress: (res) => {
          o.onProgress?.(res.bytesWritten, res.contentLength);
        },
      });

      if (o.signal) {
        o.signal.addEventListener('abort', () => {
          // react-native-fs downloadFile doesn't have a stop() method on the promise
          // The promise cancels when we abort the signal, or we can use:
          FS.stopDownload(job.jobId);
        });
      }

      const result = await job.promise;
      if (result.statusCode !== 200) {
        throw new Error(`Download failed: ${result.statusCode}`);
      }
    },

    async sha256(m: InferModel): Promise<string> {
      const hash = await FS.hash(this.path(m), 'sha256');
      return hash.toLowerCase();
    },

    async remove(m: InferModel): Promise<void> {
      await FS.unlink(this.path(m)).catch(() => {});
    },

    async freeBytes(): Promise<number> {
      const space = await FS.getFSInfo();
      return space.freeSpace;
    },
  };
}
