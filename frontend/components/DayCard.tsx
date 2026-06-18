"use client";

import type { DayPlan, Flight, Hotel, Activity } from "@/lib/types";
import {
  Plane,
  Building2,
  MapPin,
  Utensils,
  Car,
  Compass,
  Coffee,
  Clock,
  IndianRupee,
  ArrowRight,
} from "lucide-react";

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  // Handle ISO strings
  if (timeStr.includes("T")) {
    return new Date(timeStr).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  return timeStr;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}`.trim() : `${m}m`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function isFlightItem(item: Flight | Hotel | Activity): item is Flight {
  return "flightNumber" in item;
}

function isHotelItem(item: Flight | Hotel | Activity): item is Hotel {
  return "checkIn" in item && !("flightNumber" in item);
}

function ActivityIcon({ type }: { type: Activity["type"] }) {
  switch (type) {
    case "restaurant":
      return <Utensils size={16} />;
    case "transport":
      return <Car size={16} />;
    case "excursion":
      return <Compass size={16} />;
    case "free_time":
      return <Coffee size={16} />;
    default:
      return <MapPin size={16} />;
  }
}

function activityColor(type: Activity["type"]): string {
  switch (type) {
    case "restaurant":
      return "text-orange-600 bg-orange-50 border-orange-100";
    case "transport":
      return "text-slate-600 bg-slate-50 border-slate-200";
    case "excursion":
      return "text-violet-600 bg-violet-50 border-violet-100";
    case "free_time":
      return "text-teal-600 bg-teal-50 border-teal-100";
    default:
      return "text-emerald-600 bg-emerald-50 border-emerald-100";
  }
}

function FlightCard({ flight }: { flight: Flight }) {
  const statusColors: Record<Flight["status"], string> = {
    scheduled: "bg-emerald-100 text-emerald-700",
    delayed: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Plane className="text-blue-600" size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{flight.airline}</span>
          <span className="text-slate-400 text-xs font-mono">{flight.flightNumber}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[flight.status]}`}
          >
            {flight.status}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="font-bold text-slate-800">{formatTime(flight.departTime)}</span>
          <span className="text-slate-500 text-xs font-medium">{flight.origin}</span>
          <ArrowRight size={14} className="text-slate-400" />
          <span className="font-bold text-slate-800">{formatTime(flight.arriveTime)}</span>
          <span className="text-slate-500 text-xs font-medium">{flight.destination}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock size={12} /> {formatDuration(flight.durationMins)}
          </span>
          <span>{flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}</span>
          {flight.totalPrice > 0 && (
            <span className="flex items-center gap-0.5 text-blue-600 font-medium">
              <IndianRupee size={11} />
              {flight.totalPrice.toLocaleString("en-IN")}
            </span>
          )}
        </div>
        {flight.bookingRef && (
          <p className="text-xs text-slate-400 mt-1 font-mono">Ref: {flight.bookingRef}</p>
        )}
      </div>
    </div>
  );
}

function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50 border border-purple-100">
      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Building2 className="text-purple-600" size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{hotel.name}</span>
          <span className="text-yellow-400 text-xs">
            {"★".repeat(hotel.stars)}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{hotel.address}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
          <span>Check-in: {hotel.checkInTime || formatTime(hotel.checkIn)}</span>
          <span>·</span>
          <span>Check-out: {hotel.checkOutTime || formatTime(hotel.checkOut)}</span>
        </div>
        {hotel.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {hotel.amenities.slice(0, 4).map((a) => (
              <span
                key={a}
                className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full"
              >
                {a}
              </span>
            ))}
          </div>
        )}
        {hotel.pricePerNight > 0 && (
          <p className="text-xs text-purple-600 font-medium mt-1.5">
            {formatCurrency(hotel.pricePerNight)} / night
          </p>
        )}
        {hotel.bookingRef && (
          <p className="text-xs text-slate-400 mt-0.5 font-mono">Ref: {hotel.bookingRef}</p>
        )}
      </div>
    </div>
  );
}

function ActivityCard({ activity }: { activity: Activity }) {
  const colorClass = activityColor(activity.type);
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${colorClass}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-white/60`}>
        <ActivityIcon type={activity.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm">{activity.name}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {activity.location}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
          {activity.startTime && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {formatTime(activity.startTime)}
              {activity.endTime && ` – ${formatTime(activity.endTime)}`}
            </span>
          )}
          {activity.durationMins > 0 && (
            <span>{formatDuration(activity.durationMins)}</span>
          )}
          {activity.cost > 0 && (
            <span className="flex items-center gap-0.5 font-medium">
              <IndianRupee size={11} />
              {activity.cost.toLocaleString("en-IN")}
            </span>
          )}
        </div>
        {activity.notes && (
          <p className="text-xs text-slate-400 mt-1 italic">{activity.notes}</p>
        )}
        {activity.bookingRequired && (
          <span className="inline-block mt-1.5 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            Booking required
          </span>
        )}
      </div>
    </div>
  );
}

interface DayCardProps {
  day: DayPlan;
  dayNumber: number;
}

function formatDayHeader(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function DayCard({ day, dayNumber }: DayCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Day header */}
      <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white font-bold text-sm">{dayNumber}</span>
          </div>
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wider">
              Day {dayNumber}
            </p>
            <p className="text-white font-semibold text-sm">{formatDayHeader(day.date)}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-3">
        {day.items.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">No activities planned yet</p>
        ) : (
          day.items.map((item, idx) => {
            if (isFlightItem(item)) {
              return <FlightCard key={item.id || idx} flight={item} />;
            }
            if (isHotelItem(item)) {
              return <HotelCard key={item.id || idx} hotel={item} />;
            }
            return <ActivityCard key={item.id || idx} activity={item as Activity} />;
          })
        )}
      </div>
    </div>
  );
}
