import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// Every product endpoint needs a valid JWT; writes additionally need the Admin role.
router.use(authenticate);

router.get('/', productController.listProducts);
router.get('/:id', productController.getProduct);
router.post('/', requireRole('Admin'), productController.createProduct);
router.put('/:id', requireRole('Admin'), productController.updateProduct);
router.delete('/:id', requireRole('Admin'), productController.deleteProduct);

export default router;
