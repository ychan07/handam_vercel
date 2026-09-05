import { useState, type InputHTMLAttributes } from "react";
import { EyeOpenIcon, EyeClosedIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ErrorNotice({ message, title = "다시 확인해주세요", children }: { message: string; title?: string; children?: React.ReactNode }) {
  if (!message) return null;
  return <Alert variant="destructive"><ExclamationTriangleIcon /><AlertTitle>{title}</AlertTitle><AlertDescription>{message}{children}</AlertDescription></Alert>;
}
export function FormField({ label, error, secret, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; secret?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="adm-field" data-invalid={!!error}>
    <Label htmlFor={id}>{label}</Label>
    <div className="adm-input-row">
      <Input {...props} id={id} type={secret ? (visible ? "text" : "password") : "text"} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
      {secret && <Button type="button" variant="outline" size="icon" aria-label={`${label} ${visible ? "숨기기" : "보기"}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeClosedIcon /> : <EyeOpenIcon />}</Button>}
    </div>
    {error && <p id={`${id}-error`} className="adm-field-error">{error}</p>}
  </div>;
}
