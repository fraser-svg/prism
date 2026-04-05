import { useRef } from "react";
import { Button } from "@heroui/react";
import { usePrismStore } from "../context";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const { usage, checkoutLoading, createCheckout } = usePrismStore();
  const backdropRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-black">
          You've reached your free limit
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          You've used {usage?.used ?? 0} of {usage?.limit ?? 50} free AI actions.
          Upgrade to Pro for unlimited access.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-stone-700">
          <li className="flex items-center gap-2">
            <span className="text-green-600">&#10003;</span>
            Unlimited AI-powered extractions
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">&#10003;</span>
            Priority processing
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">&#10003;</span>
            All future features included
          </li>
        </ul>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:text-stone-800"
            onClick={onClose}
          >
            Maybe Later
          </button>
          <Button
            color="primary"
            size="sm"
            onPress={createCheckout}
            isLoading={checkoutLoading}
            isDisabled={checkoutLoading}
          >
            Upgrade to Pro &mdash; $49/mo
          </Button>
        </div>
      </div>
    </div>
  );
}
