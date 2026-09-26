import { Link } from 'react-router-dom';
import { CenteredPage } from '../components/common/SystemScreens';
import { Sticker } from '../components/game/Sticker';

export default function NotFound() {
  return (
    <CenteredPage testId="not-found">
      <div>
        <Sticker placement="card">Position not found</Sticker>
      </div>
      <h1 className="display text-[36px]">
        This page is between <span className="accent">opportunities.</span>
      </h1>
      <p className="text-[18px]">There's nothing at this address.</p>
      <Link to="/" className="btn btn-primary">
        Back to Larpbox
      </Link>
    </CenteredPage>
  );
}
