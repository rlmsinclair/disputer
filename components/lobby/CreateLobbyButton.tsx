"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CreateLobbyButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    const res = await fetch("/api/lobby", { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to create lobby.");
      setLoading(false);
      return;
    }
    const { lobbyId } = await res.json();
    router.push(`/lobby/${lobbyId}`);
  }

  return (
    <Button onClick={handleCreate} disabled={loading} className="gap-2">
      <Plus className="h-4 w-4" />
      {loading ? "Creating…" : "Create Lobby"}
    </Button>
  );
}
