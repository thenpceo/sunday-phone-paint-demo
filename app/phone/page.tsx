import type { Metadata } from "next";
import PhoneExperience from "../PhoneExperience";

export const metadata: Metadata = {
  title: "Phone Paint — Sunday",
  description: "The phone camera for the Phone Paint reveal.",
};

export default function PhonePage() {
  return <PhoneExperience />;
}
