import { Redirect } from 'expo-router';

/** Now "Apps that stay on this phone"; old links land there. */
export default function Moved() { return <Redirect href="/phone-apps" />; }
