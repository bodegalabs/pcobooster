import Image from "next/image";

import styles from "../app/site.module.css";

// Crops frame one region of the full 1440×960 capture without shipping extra image files.
const imageClassNames = {
  full: styles["shot-image"],
  bleed: `${styles["shot-image"]} ${styles["crop-bleed"]}`,
  history: `${styles["shot-image"]} ${styles["crop-history"]}`,
} as const;

export const ProductShot = ({
  name,
  alt,
  priority = false,
  chrome = false,
  crop = "full",
}: {
  name: "assign" | "lineup" | "history";
  alt: string;
  priority?: boolean;
  chrome?: boolean;
  crop?: keyof typeof imageClassNames;
}) => {
  const src = `/marketing/screenshots/${name}.png`;

  return (
    <figure className={styles["product-shot"]}>
      <a
        className={styles["shot-frame"]}
        href={src}
        target="_blank"
        rel="noreferrer"
        aria-label="Open full-size screenshot in a new tab"
      >
        {chrome ? (
          <div className={styles["shot-chrome"]} aria-hidden="true">
            <span className={styles["window-dots"]}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles["window-address"]}>
              pcobooster.com/services
            </span>
            <span className={styles["window-dots"]} />
          </div>
        ) : null}
        <div className={imageClassNames[crop]}>
          <Image
            src={src}
            alt={alt}
            width={1440}
            height={960}
            preload={priority}
            sizes="(max-width: 700px) 100vw, 1200px"
          />
        </div>
      </a>
    </figure>
  );
};
