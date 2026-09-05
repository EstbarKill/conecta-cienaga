import type { APIRoute } from 'astro';
import { setAuthorPostStatus } from '../../../services/posts';
import type { AuthorPostAction } from '../../../types/database';

const VALID_ACTIONS: AuthorPostAction[] = ['PAUSED', 'DELETED', 'PENDING'];

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) {
    return redirect('/login?redirect=/mis-publicaciones');
  }

  const formData = await request.formData();
  const postId = String(formData.get('postId') ?? '');
  const action = String(formData.get('action') ?? '') as AuthorPostAction;

  if (!postId || !VALID_ACTIONS.includes(action)) {
    return redirect('/mis-publicaciones?error=accion_invalida');
  }

  // La verificación real de propiedad ocurre dentro de la función RPC
  // (author_set_post_status), no aquí — esta ruta es solo el punto de
  // entrada HTTP. Si el usuario no es dueño del post, la función
  // lanza una excepción y simplemente no se aplica el cambio.
  const result = await setAuthorPostStatus(locals.supabase, postId, action);

  if (!result.success) {
    return redirect('/mis-publicaciones?error=no_actualizado');
  }

  return redirect('/mis-publicaciones?actualizado=1');
};
