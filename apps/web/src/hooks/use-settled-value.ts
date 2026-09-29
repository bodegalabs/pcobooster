import { useEffect, useState } from "react";

/**
 * The value once it has held still for `delayMs`, so arrowing through a list reads only
 * the row the user stops on.
 */
export const useSettledValue = <Value>(
  value: Value,
  delayMs: number
): Value => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
};
