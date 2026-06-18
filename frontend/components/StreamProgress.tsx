"use client";

import { CheckCircle2, Circle, Loader2, AlertTriangle } from "lucide-react";

export type StepStatus = "pending" | "active" | "done" | "error";

export interface PipelineStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
}

interface StreamProgressProps {
  steps: PipelineStep[];
  conflictCount?: number;
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={22} />;
    case "active":
      return <Loader2 className="text-indigo-500 animate-spin flex-shrink-0" size={22} />;
    case "error":
      return <AlertTriangle className="text-red-500 flex-shrink-0" size={22} />;
    default:
      return <Circle className="text-slate-300 flex-shrink-0" size={22} />;
  }
}

function stepBg(status: StepStatus): string {
  switch (status) {
    case "done":
      return "bg-emerald-50 border-emerald-200";
    case "active":
      return "bg-indigo-50 border-indigo-300 shadow-md";
    case "error":
      return "bg-red-50 border-red-200";
    default:
      return "bg-white border-slate-100";
  }
}

function stepText(status: StepStatus): string {
  switch (status) {
    case "done":
      return "text-emerald-700";
    case "active":
      return "text-indigo-700 font-semibold";
    case "error":
      return "text-red-700";
    default:
      return "text-slate-400";
  }
}

export default function StreamProgress({ steps, conflictCount }: StreamProgressProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">AI is Planning Your Trip</h2>
        <p className="text-slate-500 text-sm mt-1">
          Sit tight — this usually takes 15–30 seconds
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={step.id} className="relative">
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={`absolute left-[10px] top-[38px] w-0.5 h-3 transition-colors duration-500 ${
                  step.status === "done" ? "bg-emerald-300" : "bg-slate-200"
                }`}
              />
            )}

            <div
              className={`flex items-start gap-3 p-4 rounded-2xl border transition-all duration-300 ${stepBg(
                step.status
              )}`}
            >
              <div className="mt-0.5">
                <StepIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm transition-all duration-300 ${stepText(step.status)}`}>
                  {step.label}
                </p>
                {step.status === "active" && (
                  <p className="text-xs text-indigo-500 mt-0.5 animate-pulse">
                    {step.description}
                  </p>
                )}
                {step.status === "done" && step.id === "conflicts" && conflictCount !== undefined && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {conflictCount === 0
                      ? "No conflicts found"
                      : `${conflictCount} conflict${conflictCount > 1 ? "s" : ""} resolved`}
                  </p>
                )}
              </div>
              {step.status === "active" && (
                <div className="flex-shrink-0 flex gap-1 mt-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Overall progress bar */}
      <div className="mt-6">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>Progress</span>
          <span>
            {steps.filter((s) => s.status === "done").length} / {steps.length} steps
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${
                (steps.filter((s) => s.status === "done").length / steps.length) * 100
              }%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
