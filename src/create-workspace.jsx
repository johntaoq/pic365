import { lazy, Suspense } from 'react';

const EcommerceWorkspace = lazy(() => import('./ecommerce-workspace'));
const FreeImageWorkspace = lazy(() => import('./free-image-workspace'));

export default function CreateWorkspace({ workspaceMode = 'ecommerce', ...props }) {
  return (
    <section className={`createWorkspaceSection ${workspaceMode === 'single' ? 'freeMode' : 'ecommerceMode'}`} id="create">
      <Suspense fallback={<div className="createWorkspaceLoading" aria-live="polite"><span /></div>}>
        {workspaceMode === 'ecommerce' ? <EcommerceWorkspace {...props} /> : <FreeImageWorkspace {...props} />}
      </Suspense>
    </section>
  );
}
