import { useEffect, useState } from "react";

export default function ImageLightbox({ open, imageSrc, fileName = "receipt-image", alt = "Receipt image", onClose }) {
  const [isVisible, setIsVisible] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setIsClosing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsClosing(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isVisible]);

  useEffect(() => {
    if (!isClosing) return undefined;
    const id = window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose?.();
    }, 220);
    return () => window.clearTimeout(id);
  }, [isClosing, onClose]);

  if (!isVisible || !imageSrc) return null;

  const requestClose = () => setIsClosing(true);

  const handleBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) requestClose();
  };

  return (
    <div
      className={`image-lightbox-backdrop${isClosing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="image-lightbox-frame">
        <div className="image-lightbox-actions">
          <a className="image-lightbox-btn image-lightbox-btn--download" href={imageSrc} download={fileName}>
            <span className="material-symbols-outlined" aria-hidden="true">download</span>
            <span>Download</span>
          </a>
          <button type="button" className="image-lightbox-btn image-lightbox-btn--close" onClick={requestClose}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
            <span>Close</span>
          </button>
        </div>
        <img src={imageSrc} alt={alt} className="image-lightbox-image" />
      </div>
    </div>
  );
}
