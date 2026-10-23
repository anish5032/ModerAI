import { App } from '../App';
import { useMockApi } from '../lib/config';
import { BackendModeration } from './BackendModeration';
export function Moderation() {
    if (!useMockApi)
        return <BackendModeration />;
    return (<>
      <App />
    </>);
}
