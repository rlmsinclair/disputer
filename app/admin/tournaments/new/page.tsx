import { CreateTournamentForm } from "@/components/admin/CreateTournamentForm";

export default function NewTournamentPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">New Tournament</h1>
      <CreateTournamentForm />
    </div>
  );
}
