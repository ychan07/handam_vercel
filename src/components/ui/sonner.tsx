import { Toaster as Sonner } from "sonner";
type ToasterProps = React.ComponentProps<typeof Sonner>;
// Theme is supplied by the admin root; avoid the legacy application's .toast class.
export function Toaster(props: ToasterProps) { return <Sonner className="adm-toaster" {...props} />; }
