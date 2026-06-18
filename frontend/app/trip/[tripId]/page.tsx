"use client";

import { useEffect, useState, useRef, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plane,
  ArrowLeft,
  RefreshCw,
  MessageSquarePlus,
  CheckCircle2,
  BookOpen,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { streamSession, getItinerary, confirmBooking } from "@/lib/api";
import type { Itinerary } from "@/lib/types";
import StreamProgress, { type PipelineStep } from "@/components/StreamProgress";
import ItineraryView from "@/components/ItineraryView";
import ChangeChat from "@/components/ChangeChat";

type PageState = "streaming" | "done" | "error";

const INITIAL_STEPS: PipelineStep[] = [
  {
    id: "parse",
    label: "Parsing your travel brief",
    description: "Understanding your destination, dates, and preferences...",
    status: "pending",
  },
  {
    id: "search",
    label: "Searching Flights & Hotels",
    description: "Scanning hundreds of options for the best deals...",
    status: "pending",
  },
  {
    id: "assemble",
    label: "Assembling Itinerary",
    description: "Crafting your perfect day-by-day plan...",
    status: "pending",
  },
  {
    id: "conflicts",
    label: "Resolving Conflicts",
    description: "Checking for scheduling clashes and fixing them...",
    status: "pending",
  },
  {
    id: "done",
    label: "Done!",
    description: "Your itinerary is ready.",
    status: "pending",
  },
];

function mapNodeToStepId(node: string): string | null {
  if (node.includes("intent") || node.includes("parser") || node.includes("brief")) return "parse";
  if (node.includes("search") || node.includes("flight") || node.includes("hotel")) return "search";
  if (node.includes("assembl") || node.includes("itinerary")) return "assemble";
  if (node.includes("conflict")) return "conflicts";
  return null;
}

export default function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session") ?? "";

  const [pageState, setPageState] = useState<PageState>("streaming");
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [conflictCount, setConflictCount] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showChangePanel, setShowChangePanel] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);

  const updateStep = (
    id: string,
    status: PipelineStep["status"],
    doneAll = false
  ) => {
    setSteps((prev) => {
      const next = prev.map((s) => {
        if (s.id === id) return { ...s, status };
        // Mark all prior steps as done when a step becomes active
        if (status === "active") {
          const targetIdx = prev.findIndex((x) => x.id === id);
          const currIdx = prev.findIndex((x) => x.id === s.id);
          if (currIdx < targetIdx && s.status !== "done") {
            return { ...s, status: "done" };
          }
        }
        return s;
      });
      if (doneAll) {
        return next.map((s) => ({ ...s, status: "done" }));
      }
      return next;
    });
  };

  const handleEvent = (type: string, payload: unknown) => {
    const pl = payload as Record<string, unknown> | null;

    switch (type) {
      case "graph:node_start": {
        const node = (pl?.node as string) ?? "";
        const stepId = mapNodeToStepId(node);
        if (stepId) {
          updateStep(stepId, "active");
        }
        break;
      }
      case "search_complete":
        updateStep("search", "done");
        updateStep("assemble", "active");
        break;
      case "conflict_detected":
        updateStep("assemble", "done");
        updateStep("conflicts", "active");
        setConflictCount((pl?.count as number) ?? 1);
        break;
      case "conflict_resolved":
        updateStep("conflicts", "done");
        break;
      case "complete":
        // handled in onDone
        break;
      case "error":
        setErrorMsg(String(pl?.message ?? "An unexpected error occurred."));
        setPageState("error");
        break;
    }
  };

  const fetchAndShowItinerary = async () => {
    try {
      const data = await getItinerary(tripId);
      setItinerary(data);
      updateStep("done", "done", true);
      setPageState("done");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to load itinerary. Please try refreshing."
      );
      setPageState("error");
    }
  };

  const handleDone = () => {
    fetchAndShowItinerary();
  };

  const handleError = (e: string) => {
    setErrorMsg(e);
    setPageState("error");
  };

  useEffect(() => {
    if (!sessionId) {
      setErrorMsg("No session ID found. Please go back and try again.");
      setPageState("error");
      return;
    }

    // Mark first step as active immediately
    setSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: "active" } : s))
    );

    const cleanup = streamSession(sessionId, handleEvent, handleDone, handleError);
    cleanupRef.current = cleanup;

    return () => {
      cleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleConfirmBooking = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmBooking(tripId);
      setConfirmed(true);
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : "Booking confirmation failed."
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleRetry = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav bar */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 rounded-xl p-1.5">
              <Plane className="text-indigo-600" size={16} />
            </div>
            <span className="text-slate-800 font-bold text-sm">TravelAI</span>
          </div>

          <div className="flex items-center gap-2">
            {pageState === "done" && (
              <>
                <button
                  onClick={() => window.location.reload()}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  title="Refresh"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={() => setShowChangePanel(true)}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"
                >
                  <MessageSquarePlus size={14} />
                  Request Change
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Streaming / Loading state */}
        {pageState === "streaming" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
              <StreamProgress steps={steps} conflictCount={conflictCount} />
            </div>
            <p className="text-slate-400 text-xs mt-6">
              Session: <span className="font-mono">{sessionId.slice(0, 16)}…</span>
            </p>
          </div>
        )}

        {/* Error state */}
        {pageState === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="text-red-500" size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Something Went Wrong</h2>
              <p className="text-slate-500 max-w-sm">
                {errorMsg ?? "An unexpected error occurred. Please try planning your trip again."}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl transition shadow-md"
              >
                Plan Again
              </button>
              <button
                onClick={fetchAndShowItinerary}
                className="px-6 py-3 bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 font-semibold rounded-2xl transition"
              >
                Try Load Anyway
              </button>
            </div>
          </div>
        )}

        {/* Done — show itinerary */}
        {pageState === "done" && itinerary && (
          <div className="space-y-6">
            {/* Success banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={22} />
              <div className="flex-1">
                <p className="text-emerald-800 font-semibold text-sm">
                  Your itinerary is ready!
                </p>
                <p className="text-emerald-600 text-xs mt-0.5">
                  Review the details below, then confirm your booking.
                </p>
              </div>
              {!confirmed ? (
                <button
                  onClick={handleConfirmBooking}
                  disabled={confirming}
                  className="flex-shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-70"
                >
                  {confirming ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Confirming…
                    </>
                  ) : (
                    <>
                      <BookOpen size={14} />
                      Confirm Booking
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-sm">
                  <CheckCircle2 size={16} />
                  Confirmed!
                </div>
              )}
            </div>

            {confirmError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                {confirmError}
              </div>
            )}

            <ItineraryView itinerary={itinerary} />

            {/* Floating change button (mobile) */}
            <div className="fixed bottom-6 right-6 z-20 md:hidden">
              <button
                onClick={() => setShowChangePanel(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3.5 rounded-full shadow-xl transition"
              >
                <MessageSquarePlus size={18} />
                Request Change
              </button>
            </div>
          </div>
        )}

        {/* Done but no itinerary loaded */}
        {pageState === "done" && !itinerary && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <Loader2 className="text-indigo-400 animate-spin" size={32} />
            <p className="text-slate-500">Loading your itinerary…</p>
          </div>
        )}
      </main>

      {/* Change panel */}
      {showChangePanel && sessionId && (
        <ChangeChat sessionId={sessionId} onClose={() => setShowChangePanel(false)} />
      )}
    </div>
  );
}
