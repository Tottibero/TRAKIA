export const IS_PUBLIC = 'isPublic'

export function Public(): MethodDecorator & ClassDecorator {
  return ((target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(IS_PUBLIC, true, descriptor?.value ?? target)
  }) as MethodDecorator & ClassDecorator
}
