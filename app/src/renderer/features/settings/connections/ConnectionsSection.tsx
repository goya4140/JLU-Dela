import { CampusView } from '../../campus/CampusView';

type ConnectionsSectionProps = {
  onOpenMail: () => void;
  onOpenShuiyuan: () => void;
  onOpenTimetable: () => void;
};

export function ConnectionsSection(_props: ConnectionsSectionProps) {
  return <CampusView title="校园平台连接" />;
}
