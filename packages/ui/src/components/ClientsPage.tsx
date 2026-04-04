import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrismStore } from "../context";
import { CreateClientModal } from "./CreateClientModal";

export function ClientsPage() {
  const { clients, portfolioGroups, portfolioLoading, loadPortfolio } =
    usePrismStore();
  const navigate = useNavigate();
  const [showCreateClient, setShowCreateClient] = useState(false);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const projectCountFor = (clientId: string) =>
    portfolioGroups.find((g) => g.client?.id === clientId)?.projects.length ?? 0;

  if (portfolioLoading && clients.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-8 py-10">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-[17px] font-medium text-black">Clients</h1>
          <p className="text-[15px] text-stone-900">
            Manage your client accounts
          </p>
        </div>
        <button
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[15px] text-stone-800 transition-colors hover:bg-stone-50"
          onClick={() => setShowCreateClient(true)}
        >
          + Client
        </button>
      </header>

      {clients.length === 0 ? (
        <div className="flex h-[60%] flex-col items-center justify-center gap-3">
          <span className="text-[17px] font-medium text-black">
            No clients yet
          </span>
          <span className="max-w-[360px] text-center text-[15px] text-stone-900">
            Create your first client to organize projects.
          </span>
          <button
            className="mt-2 rounded-lg bg-stone-800 px-4 py-2 text-[15px] font-medium text-white transition-colors hover:bg-stone-700"
            onClick={() => setShowCreateClient(true)}
          >
            Create Client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => {
            const count = projectCountFor(client.id);
            return (
              <div
                key={client.id}
                className="rounded-xl border border-stone-200 bg-[var(--bg-surface)] p-5 transition-colors hover:border-stone-300"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[15px] font-medium text-black">
                    {client.name}
                  </h3>
                  <span className="rounded-full bg-[#91A6FF]/20 px-2 py-0.5 text-[13px] font-medium text-[#4A5A99]">
                    {count} {count === 1 ? "project" : "projects"}
                  </span>
                </div>
                {client.notes && (
                  <p className="mb-3 text-[14px] text-stone-700 line-clamp-2">
                    {client.notes}
                  </p>
                )}
                <button
                  className="text-[15px] text-stone-900 transition-colors hover:text-black"
                  onClick={() => navigate(`/clients/${client.id}/context`)}
                >
                  View
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreateClient && (
        <CreateClientModal onClose={() => setShowCreateClient(false)} />
      )}
    </div>
  );
}
