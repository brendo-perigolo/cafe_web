import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LancamentoDialog } from "@/components/LancamentoDialog";

const LAST_PATH_STORAGE_KEY = "safra:last_path";

const getReturnPath = () => {
  const stored =
    window.localStorage.getItem(LAST_PATH_STORAGE_KEY) || window.sessionStorage.getItem(LAST_PATH_STORAGE_KEY);
  if (!stored || stored === "/auth" || stored === "/lancamento" || stored === "/selecionar-empresa") return "/dashboard";
  return stored;
};

export default function Lancamento() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const returnPath = useMemo(() => getReturnPath(), []);

  return (
    <div className="min-h-screen bg-background">
      <LancamentoDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            navigate(returnPath, { replace: true });
          }
        }}
      />
    </div>
  );
}
