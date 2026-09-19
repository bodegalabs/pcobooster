import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

import styles from "../app/site.module.css";

export const ProductShot = ({
  name,
  alt,
  priority = false,
  caption,
}: {
  name: "assign" | "lineup" | "history";
  alt: string;
  priority?: boolean;
  caption: string;
}) => (
  <figure className={styles["product-shot"]}>
    <a
      href={`/marketing/screenshots/${name}.png`}
      target="_blank"
      rel="noopener"
      aria-label={`View full screenshot: ${caption}`}
    >
      <div className={styles["shot-window"]}>
        <div className={styles["shot-chrome"]} aria-hidden="true">
          <span className={styles["window-dots"]}>
            <i />
            <i />
            <i />
          </span>
          <span>pcobooster.com</span>
          <span className={styles["chrome-label"]}>{caption}</span>
        </div>
        <div className={styles["shot-image"]}>
          <Image
            src={`/marketing/screenshots/${name}.png`}
            alt={alt}
            width={1440}
            height={960}
            preload={priority}
            sizes="(max-width: 700px) 100vw, 1200px"
          />
        </div>
      </div>
    </a>
    <figcaption>
      <span>{caption}</span>
      <span>
        Explore the detail <ArrowUpRight size={12} aria-hidden="true" />
      </span>
    </figcaption>
  </figure>
);
