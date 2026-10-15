"use client";
import { useId, useState, type FormEvent } from "react";
import {
  FEEDBACK_EMAIL,
  FeedbackSchema,
  cleanViewport,
  maskPage,
} from "@/lib/feedback-link";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

type Problem = "invalid" | "rate_limited" | "unavailable" | null;

/** Demo feedback, saved on the server for the team to review. Testers need
 * no account. Sends only what's typed here, the masked
 * page and the screen size: never form or result content. */
export function FeedbackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [sending, setSending] = useState(false);
  const { show } = useToast();
  const ids = { msg: useId(), contact: useId(), err: useId() };

  const close = () => {
    setError(null);
    setProblem(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = {
      message,
      contact,
      website,
      page: maskPage(window.location.pathname),
      viewport: cleanViewport(`${window.innerWidth}×${window.innerHeight}`),
    };
    const parsed = FeedbackSchema.safeParse(input);
    const msgIssue = parsed.error?.issues.find((i) => i.path[0] !== "website");
    if (msgIssue) {
      setError(msgIssue.message);
      return;
    }
    setError(null);
    setProblem(null);
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        setMessage("");
        setContact("");
        close();
        show({
          title: "Thanks, the team has it",
          body: "Your feedback was sent.",
          tone: "ok",
        });
        return;
      }
      setProblem(
        res.status === 429
          ? "rate_limited"
          : res.status === 400
            ? "invalid"
            : "unavailable",
      );
    } catch {
      setProblem("unavailable");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Give feedback">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-normal text-ink-2">
          Tell the team what worked, what didn&apos;t, or what you expected.
          This is sample data, so please don&apos;t type real patient details.
        </p>
        <label htmlFor={ids.msg} className="text-[13px] font-semibold">
          Your feedback
        </label>
        <textarea
          id={ids.msg}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.err : undefined}
          className="rounded-2xl border border-line p-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep"
        />
        {error && (
          <p id={ids.err} role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}
        <label htmlFor={ids.contact} className="text-[13px] font-semibold">
          Your name or role{" "}
          <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          id={ids.contact}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={120}
          autoComplete="name"
          className="min-h-11 rounded-full border border-line px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep"
        />
        {/* Spam trap: hidden from people and screen readers. */}
        <input
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] size-px opacity-0"
        />
        {problem && (
          <p role="alert" className="text-[13px] text-bad">
            {problem === "rate_limited"
              ? "That's a lot of messages in a short time. Please try again in a few minutes."
              : problem === "invalid"
                ? "We couldn't send that. Check your message and try again."
                : "We couldn't send it right now. "}
            {problem === "unavailable" && (
              <a
                className="font-semibold underline"
                href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("MHAI demo feedback")}`}
              >
                Email the team instead
              </a>
            )}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={sending}>
            {sending ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
