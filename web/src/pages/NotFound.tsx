import { Link } from 'react-router-dom';

export const NotFound = () => (
  <div className="center-screen" style={{ textAlign: 'center' }}>
    <div className="stack" style={{ justifyItems: 'center', gap: 24 }}>
      <div className="big-404 num" aria-hidden="true">404</div>
      <h1 className="t-title">Nothing here.</h1>
      <Link className="btn secondary" to="/today">Back to Today</Link>
    </div>
  </div>
);
