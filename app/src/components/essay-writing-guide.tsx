"use client";

import { ArrowRight, BookOpenCheck, Check, Lightbulb, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const steps = [
  {
    number: "01",
    title: "Read the contract",
    instruction: "Turn the assignment into a short list of promises your essay must keep.",
    questions: ["What action does the prompt demand?", "Who is reading?", "Which constraints and sources apply?"],
  },
  {
    number: "02",
    title: "Find the answer",
    instruction: "Write one sentence that answers the central question and gives the essay a direction.",
    questions: ["Can a thoughtful reader disagree?", "Is the claim narrow enough to support here?", "Why should the reader care?"],
  },
  {
    number: "03",
    title: "Build the reasoning",
    instruction: "For every major claim, connect evidence to the conclusion instead of asking the reader to make the leap.",
    questions: ["What supports this claim?", "Why does that evidence prove it?", "What assumption makes the connection work?"],
  },
  {
    number: "04",
    title: "Give paragraphs jobs",
    instruction: "Each paragraph should perform one necessary job in the argument, in an order the reader can follow.",
    questions: ["What changes for the reader here?", "Does this advance the thesis?", "Would moving or deleting it improve the line of thought?"],
  },
  {
    number: "05",
    title: "Deepen, then polish",
    instruction: "Test the argument's limits before fixing sentences. Higher-order revision creates the largest improvement.",
    questions: ["What is the strongest objection?", "Where does the claim stop being true?", "Which wording is vague, distracting, or hard to parse?"],
  },
] as const;

const checklist = [
  "I answered the actual question.",
  "My thesis states a specific, supportable answer.",
  "Every major claim has evidence and an explained warrant.",
  "Each paragraph has one necessary job.",
  "I tested assumptions, limits, and the strongest relevant objection.",
  "I revised the argument before proofreading the sentences.",
] as const;

export function EssayWritingGuide() {
  return <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" className="active:scale-[0.97]"><BookOpenCheck /> Learn to write</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[min(90dvh,54rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
      <div className="border-b border-border bg-card/80 px-5 py-5 pr-14 sm:px-7 sm:py-6">
        <DialogHeader>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Essay field guide</p>
          <DialogTitle className="text-xl sm:text-2xl">Make a promise. Then earn it.</DialogTitle>
          <DialogDescription className="max-w-2xl leading-relaxed">A practical method for moving from an assignment to a clear, supported essay. Use it before the reviewer so the first draft already has a spine.</DialogDescription>
        </DialogHeader>
      </div>

      <div className="overflow-y-auto overscroll-contain">
        <section className="border-b border-border px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-3 text-sm sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <div className="rounded-xl border border-border bg-background p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Question</p><p className="mt-2 font-medium">What must I answer?</p></div>
            <ArrowRight aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
            <div className="rounded-xl border border-border bg-background p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Thesis</p><p className="mt-2 font-medium">What is my answer?</p></div>
            <ArrowRight aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
            <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Argument</p><p className="mt-2 font-medium">Why should the reader believe it?</p></div>
          </div>
        </section>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <ol className="divide-y divide-border">
            {steps.map((step) => <li key={step.number} className="grid gap-4 px-5 py-6 sm:grid-cols-[3rem_1fr] sm:px-7">
              <span className="font-mono text-xs text-muted-foreground">{step.number}</span>
              <div><h3 className="text-base font-semibold">{step.title}</h3><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{step.instruction}</p><ul className="mt-4 grid gap-2 sm:grid-cols-3">{step.questions.map((question) => <li key={question} className="rounded-lg bg-muted/45 px-3 py-2.5 text-xs leading-relaxed">{question}</li>)}</ul></div>
            </li>)}
          </ol>

          <aside className="border-t border-border bg-muted/20 p-5 sm:p-7 lg:border-t-0 lg:border-l">
            <div className="lg:sticky lg:top-0">
              <div className="flex items-center gap-2"><Lightbulb className="size-4 text-warning" /><h3 className="text-sm font-semibold">The missing middle</h3></div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">A common gap is a claim and evidence without the warrant: the explanation of why the evidence supports the claim.</p>
              <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4 text-sm">
                <p><span className="text-muted-foreground">Claim:</span> The policy should change.</p>
                <p><span className="text-muted-foreground">Evidence:</span> A relevant example shows a recurring problem.</p>
                <p className="border-l-2 border-warning/60 pl-3"><span className="text-muted-foreground">Warrant:</span> Explain the principle that makes this example a reason for changing the policy.</p>
              </div>
              <div className="mt-7 flex items-center gap-2"><Quote className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Vocabulary rule</h3></div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Prefer the most precise familiar word. Rare words, long sentences, and an “academic” tone do not make an idea deeper.</p>
            </div>
          </aside>
        </div>

        <section className="border-t border-border bg-card/70 px-5 py-6 sm:px-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Before review</p>
          <h3 className="mt-2 text-base font-semibold">Six checks for a finished draft</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">{checklist.map((item) => <li key={item} className="flex gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm"><span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/12 text-success"><Check className="size-3" /></span>{item}</li>)}</ul>
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}
