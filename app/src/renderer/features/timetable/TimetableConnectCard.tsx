import { AcademicConnection } from './AcademicConnection';

export function TimetableConnectCard({
  semester,
  onSuccess,
}: {
  semester?: string;
  onSuccess: () => void;
}) {
  return <AcademicConnection key={semester} semester={semester} onSuccess={onSuccess} />;
}
