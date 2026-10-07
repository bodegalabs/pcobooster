/** A person's own page in Planning Center People. */
export const planningCenterPersonUrl = (personId: string) =>
  `https://people.planningcenteronline.com/people/AC${encodeURIComponent(personId)}`;
