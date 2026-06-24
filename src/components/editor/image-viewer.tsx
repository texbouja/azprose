import { useEffect, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

type ImageViewerProps = {
  path: string;
};

export function ImageViewer({ path }: ImageViewerProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setDimensions(null);
    setError(null);

    void (async () => {
      try {
        const bytes = await readFile(path);
        if (cancelled) return;
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const mime =
          ext === "svg" ? "image/svg+xml" :
          ext === "png" ? "image/png" :
          ext === "webp" ? "image/webp" :
          "image/jpeg";
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setSrc(url);

        const img = new Image();
        img.onload = () => {
          if (!cancelled) setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          if (!cancelled) {
            setError("could not decode image");
            URL.revokeObjectURL(url);
          }
        };
        img.src = url;
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();

    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className="mdv-image-viewer">
      {error ? (
        <div className="mdv-image-viewer__error">could not load image — {error}</div>
      ) : (
        <>
          <div className="mdv-image-viewer__info">
            {dimensions ? `${dimensions.w} × ${dimensions.h}` : "loading…"}
          </div>
          {src && (
            <div className="mdv-image-viewer__canvas">
              <img
                src={src}
                alt=""
                className="mdv-image-viewer__img"
                draggable={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
