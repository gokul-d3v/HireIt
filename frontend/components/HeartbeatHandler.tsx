"use client";

import { useHeartbeat } from "@/hooks/useHeartbeat";
import { useAuth } from "@/context/AuthContext";

export default function HeartbeatHandler() {
  const { user } = useAuth();
  useHeartbeat(!!user);
  return null;
}
