import { notFound } from "next/navigation";

// proxy.ts rewrites full page loads of /c/<id> and /print/<id> here. The
// session lives in memory only, so after a load it can't hold that
// consultation: answer with a real 404, inside the shell.
export default function Ended() {
  notFound();
}
