import { useLayoutEffect, useRef, useState } from "react";

const placeholderUrl = new URL("../../assets/book-placeholder.svg", import.meta.url).href;

type CoverImageProps = {
  alt?: string;
  className?: string;
  src?: string | null;
};

/**
 * Purpose: Render a cover image with a reliable placeholder while the image is
 * loading or when the provider image cannot be downloaded.
 *
 * @param props - Cover image inputs.
 * @param props.alt - Accessible alt text for the loaded image.
 * @param props.className - Optional image class name.
 * @param props.src - Provider image URL.
 * @returns A cover image element that falls back to the local placeholder.
 */
export function CoverImage({ alt = "", className = "series-image", src }: CoverImageProps) {
  // Remember which URL loaded or failed instead of a flag that an effect
  // resets: a cached cover can fire `load` before such an effect runs, which
  // left the image stuck in its dimmed loading state after a re-scan.
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [erroredSource, setErroredSource] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageSource = src && erroredSource !== src ? src : placeholderUrl;
  const hasLoaded = loadedSource === imageSource;

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoadedSource(imageSource);
  }, [imageSource]);

  return (
    <img
      alt={alt}
      className={`${className}${hasLoaded ? " cover-image--loaded" : " cover-image--loading"}`}
      decoding="async"
      loading="lazy"
      onError={() => {
        if (src && imageSource === src) setErroredSource(src);
      }}
      onLoad={() => setLoadedSource(imageSource)}
      ref={imageRef}
      referrerPolicy="no-referrer"
      src={imageSource}
    />
  );
}
