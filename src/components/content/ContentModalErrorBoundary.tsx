import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; onClose: () => void };
type State = { hasError: boolean };

/** Evita modal vacío (solo overlay) si el detalle de Contenido lanza en render. */
export class ContentModalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Contenido · modal]", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            No se pudo mostrar el detalle de este establecimiento. Revisa la consola del navegador o recarga la página con Ctrl+Shift+R.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onClose();
            }}
          >
            Cerrar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
