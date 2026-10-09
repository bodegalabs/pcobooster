import "@fontsource-variable/inter";

const WEIGHTS = [400, 450, 500, 600, 700] as const;

const loadInter = async (): Promise<void> => {
  await Promise.all(
    WEIGHTS.map(async (weight) => {
      await document.fonts.load(`${weight} 32px "Inter Variable"`);
    })
  );
  await document.fonts.ready;
};

let loading: Promise<void> | null = null;

/** Inter loads lazily per weight; measure and screenshot only once every weight is in. */
export const fontsReady = async (): Promise<void> => {
  loading ??= loadInter();
  await loading;
};
