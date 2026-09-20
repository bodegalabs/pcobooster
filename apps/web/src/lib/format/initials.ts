export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() || "?";
  }
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
};
