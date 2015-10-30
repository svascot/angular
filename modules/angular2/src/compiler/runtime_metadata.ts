import {resolveForwardRef} from 'angular2/src/core/di';
import {
  Type,
  isBlank,
  isPresent,
  isArray,
  stringify,
  RegExpWrapper
} from 'angular2/src/facade/lang';
import {BaseException} from 'angular2/src/facade/exceptions';
import {MapWrapper, StringMapWrapper, ListWrapper} from 'angular2/src/facade/collection';
import * as cpl from './directive_metadata';
import * as md from 'angular2/src/core/metadata/directives';
import {DirectiveResolver} from 'angular2/src/core/linker/directive_resolver';
import {ViewResolver} from 'angular2/src/core/linker/view_resolver';
import {ViewMetadata} from 'angular2/src/core/metadata/view';
import {hasLifecycleHook} from 'angular2/src/core/linker/directive_lifecycle_reflector';
import {LifecycleHooks, LIFECYCLE_HOOKS_VALUES} from 'angular2/src/core/linker/interfaces';
import {reflector} from 'angular2/src/core/reflection/reflection';
import {Injectable, Inject, Optional} from 'angular2/src/core/di';
import {AMBIENT_DIRECTIVES} from 'angular2/src/core/ambient';
import {MODULE_SUFFIX} from './util';

@Injectable()
export class RuntimeMetadataResolver {
  private _cache = new Map<Type, cpl.CompileDirectiveMetadata>();

  constructor(private _directiveResolver: DirectiveResolver, private _viewResolver: ViewResolver,
              @Optional() @Inject(AMBIENT_DIRECTIVES) private _ambientDirectives: Type[]) {}

  getMetadata(directiveType: Type): cpl.CompileDirectiveMetadata {
    var meta = this._cache.get(directiveType);
    if (isBlank(meta)) {
      var dirMeta = this._directiveResolver.resolve(directiveType);
      var moduleUrl = calcModuleUrl(directiveType, dirMeta);
      var templateMeta = null;
      var changeDetectionStrategy = null;

      if (dirMeta instanceof md.ComponentMetadata) {
        var cmpMeta = <md.ComponentMetadata>dirMeta;
        var viewMeta = this._viewResolver.resolve(directiveType);
        templateMeta = new cpl.CompileTemplateMetadata({
          encapsulation: viewMeta.encapsulation,
          template: viewMeta.template,
          templateUrl: viewMeta.templateUrl,
          styles: viewMeta.styles,
          styleUrls: viewMeta.styleUrls
        });
        changeDetectionStrategy = cmpMeta.changeDetection;
      }
      meta = cpl.CompileDirectiveMetadata.create({
        selector: dirMeta.selector,
        exportAs: dirMeta.exportAs,
        isComponent: isPresent(templateMeta),
        dynamicLoadable: true,
        type: new cpl.CompileTypeMetadata(
            {name: stringify(directiveType), moduleUrl: moduleUrl, runtime: directiveType}),
        template: templateMeta,
        changeDetection: changeDetectionStrategy,
        inputs: dirMeta.inputs,
        outputs: dirMeta.outputs,
        host: dirMeta.host,
        lifecycleHooks: LIFECYCLE_HOOKS_VALUES.filter(hook => hasLifecycleHook(hook, directiveType))
      });
      this._cache.set(directiveType, meta);
    }
    return meta;
  }

  getViewDirectivesMetadata(component: Type): cpl.CompileDirectiveMetadata[] {
    var view = this._viewResolver.resolve(component);
    var directives = flattenDirectives(view, this._ambientDirectives);
    for (var i = 0; i < directives.length; i++) {
      if (!isValidDirective(directives[i])) {
        throw new BaseException(
            `Unexpected directive value '${stringify(directives[i])}' on the View of component '${stringify(component)}'`);
      }
    }

    return removeDuplicates(directives).map(type => this.getMetadata(type));
  }
}

function removeDuplicates(items: any[]): any[] {
  let m = new Map<any, any>();
  items.forEach(i => m.set(i, null));
  return MapWrapper.keys(m);
}

function flattenDirectives(view: ViewMetadata, ambientDirectives: any[]): Type[] {
  let directives = [];
  if (isPresent(ambientDirectives)) {
    flattenArray(ambientDirectives, directives);
  }
  if (isPresent(view.directives)) {
    flattenArray(view.directives, directives);
  }
  return directives;
}

function flattenArray(tree: any[], out: Array<Type | any[]>): void {
  for (var i = 0; i < tree.length; i++) {
    var item = resolveForwardRef(tree[i]);
    if (isArray(item)) {
      flattenArray(item, out);
    } else {
      out.push(item);
    }
  }
}

function isValidDirective(value: Type): boolean {
  return isPresent(value) && (value instanceof Type);
}

function calcModuleUrl(type: Type, dirMeta: md.DirectiveMetadata): string {
  if (isPresent(dirMeta.moduleId)) {
    return `package:${dirMeta.moduleId}${MODULE_SUFFIX}`;
  } else {
    return reflector.importUri(type);
  }
}