import { Redirect } from "expo-router";

import { useSession } from "../src/app-shell/session";

/** The app opens on the Services tab, or on sign-in when nobody is signed in. */
const Index = () => (
  <Redirect href={useSession().active === null ? "/sign-in" : "/services"} />
);

export default Index;
