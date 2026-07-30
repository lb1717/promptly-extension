import { SITE } from "@/lib/constants";
import { redirect } from "next/navigation";

export default function LaunchPage() {
  redirect(SITE.launchPath);
}
