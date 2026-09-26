import { Link } from 'react-router-dom';
import { CenteredPage } from '../components/common/SystemScreens';
import { Stamp } from '../components/game/Stamp';

export default function NotFound() {
  return (
    <CenteredPage testId="not-found">
      <Stamp tone="muted" size={24}>
        Position not found
      </Stamp>
      <h1 className="text-[32px] leading-tight">This page is between opportunities.</h1>
      <p className="text-[18px]">There's nothing at this address.</p>
      <Link to="/" className="btn btn-primary">
        Back to Larpbox
      </Link>
    </CenteredPage>
  );
}
